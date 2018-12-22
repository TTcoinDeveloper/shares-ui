import assert from "assert"
import alt from "alt-instance"
import BaseStore from "stores/BaseStore"
import { List, Map, Set, fromJS } from "immutable"
// import idb_helper from "idb-helper";
// import _ from "lodash";

import iDB from "idb-instance"
import { Apis } from "@graphene/chain"
import { key, Aes } from "@graphene/ecc"
import { suggest_brain_key } from "../common/brainkey"

import { PrivateKey } from "@graphene/ecc";
import { chain_config } from "@graphene/chain"
import { ChainStore } from "@graphene/chain"
import { WalletWebSocket, WalletApi } from "@graphene/wallet-client"

import CachedPropertyActions from "actions/CachedPropertyActions"
import TransactionConfirmActions from "actions/TransactionConfirmActions"
import WalletUnlockActions from "actions/WalletUnlockActions"
import SettingsActions from "actions/SettingsActions"
import SettingsStore from "stores/SettingsStore"

import {
    IndexedDbPersistence, WalletStorage, ConfidentialWallet, AddressIndex
} from "@graphene/wallet-client"

var aes_private
var transaction
var wallet, cwallet

var TRACE = false

/**
    The Web Wallet User API (for the user-interface).
    
    This is multi-wallet, but as a singleton it holds a single wallet open at any given time.
    
    Updates the following in wallet.wallet_object:
    ```js
    const empty_wallet = fromJS({
        public_name: t.Str,
        brainkey: t.maybe(t.Str),
        brainkey_sequence: t.Num,
        brainkey_backup_date: t.maybe(t.Dat),
        chain_id: t.Str
    })
    ```
*/
class WalletDb extends BaseStore {
    
    constructor() {
        super()
        this.subscribers = Set()
        this.legacy_wallet_names = Set()
        this.memoCache = Map()
        this.state = {
            saving_keys: false,
            current_wallet: undefined,
            wallet_names: Set(),
            locked: true,
        } 
        this.notify = notify.bind(this)
        this.bindListeners({
            onChangeSetting: SettingsActions.changeSetting,
        })
        
        // Confirm only works when there is a UI (this lets a mocha unit test disable it)
        this.confirm_transactions = true
        
        ChainStore.subscribe(this.checkNextGeneratedKey.bind(this))
        this.generateNextKey_pubcache = []
        
        // short-cuts into the wallet's data object
        this.keys = ()=> map(wallet, "keys")
        this.deposit_keys = ()=> map(wallet, "deposit_keys")
        this.data = ()=> !( wallet && wallet.wallet_object) ? Map() : wallet.wallet_object
        this.prop = (name, default_value) => this.data().has(name) ? this.data().get(name) : default_value
        
        
        // WalletDb use to be a plan old javascript class (not an Alt store) so
        // for now many methods need to be exported...
        this._export(
            "openWallet", "getWallet", "update", "isEmpty", "importKeys","getBrainKey","deleteWallet",
            "keys", "deposit_keys", "data", "prop",
            "process_transaction", "decodeMemo","getPrivateKey","getDeterministicKeys",
            "logout","isLocked","onCreateWallet","login","changePassword","verifyPassword",
            "setWalletModified","setBackupDate","setBrainkeyBackupDate","binaryBackupRecommended", "api",// "tryRestoreKey",
            "loadDbData", "subscribe", "unsubscribe", 
        )
    }
    
    api() {
        let url = SettingsStore.getSetting("backup_server")
        let ws_rpc = new WalletWebSocket(url, false)
        let api = new WalletApi(ws_rpc)
        return api
    }
    
    /** @arg {function} callback - called for current wallet by WalletStorage.subscribe(callback) 
    */
    subscribe( callback ) {
        if(this.subscribers.has(callback)) {
            console.error("WalletDb\tSubscribe callback already exists", callback)
            return
        }
        this.subscribers = this.subscribers.add(callback)
    }
    
    /**
    *  Remove a callback that was previously added via {@link this.subscribe}
    */
    unsubscribe( callback ) {
        if( ! this.subscribers.has(callback)) {
            console.log("WalletDb\tWARN Unsubscribe callback does not exists")
            return
        }
        this.subscribers = this.subscribers.remove( callback )
    }
    
    onChangeSetting(payload) {
        if (payload.setting === "backup_server") {
            if( ! wallet ) return
            let url = payload.value === "" ? null : payload.value
            wallet.useBackupServer(url)
        }
    }
    
    /** Loads wallet lists and last active wallet. */
    loadDbData() {
        
        // All wallets new and old
        let wallet_names = Set()
        this.legacy_wallet_names = Set()
        
        let current_wallet, storage
        
        return Promise.resolve()

        // get all wallet names
        .then(()=> new IndexedDbPersistence("wallet::" + chain_config.address_prefix).open())
        .then( db => db.getAllKeys())
        .then( keys => {
            for(let name of keys)
                wallet_names = wallet_names.add(name)
        })
        
        // legacy wallet_names
        .then(()=>
            iDB.root.getProperty("wallet_names", []).then( legacy_wallet_names => {
                for(let name of legacy_wallet_names) {
                    wallet_names = wallet_names.add(name)
                    this.legacy_wallet_names = this.legacy_wallet_names.add(name)
                }
            })
        )
        
        .then(()=> iDB.root.getProperty("current_wallet").then(c => current_wallet = c))
        .then(()=>{
            if(! wallet_names.has(current_wallet))
                current_wallet = wallet_names.size ? wallet_names.first() : undefined
        })
        .then( ()=> this.setState({ current_wallet, wallet_names }) )
        .then( ()=> this.openWallet(current_wallet) )
    }
    
    /**
        Change or open a wallet, this may or may not be empty.  It is necessary to call onCreateWallet to complete this process.
        @return Promise
    */
    openWallet(wallet_name) {
        
        if( wallet_name === this.state.current_wallet && wallet != null )
            return Promise.resolve(wallet)
        
        if( wallet ) {
            // this.logout()
            wallet.unsubscribe(this.notify)
        }
        
        if(! wallet_name) {
            wallet = undefined
            cwallet = undefined
            this.setState({ current_wallet: undefined, wallet, cwallet })
            return Promise.resolve()
        }
        
        console.log("WalletDb\topenWallet", wallet_name);

        let key = "wallet::" + chain_config.address_prefix
        let storage = new IndexedDbPersistence( key )
        
        return Promise.resolve()
        .then(()=> storage.open(wallet_name))
        .then(()=>{
            
            let _wallet = new WalletStorage(storage)            
            _wallet.subscribe(this.notify)
            
            try {
                let url = SettingsStore.getSetting("backup_server")
                if( url === "" ) url = null
                _wallet.useBackupServer(url)
            }catch(error) { console.error(error); }
            
            let _cwallet = new ConfidentialWallet(_wallet)
            // Transaction confirmations
            _cwallet.process_transaction = (tr, broadcast, broadcast_confirmed_callback) =>
                this.process_transaction( tr, null /*signer_private_keys*/, true, broadcast_confirmed_callback )
            
            // No exceptions so update state:
            cwallet = _cwallet
            wallet = _wallet
            let wallet_names = this.state.wallet_names.add(wallet_name)
            this.setState({ current_wallet: wallet_name, wallet_names, wallet, cwallet }) // public
            try {
                // browser console references
                window.wallet = wallet
                window.cwallet = cwallet
            } catch(error){
                //nodejs:ReferenceError: window is not defined
            }
        })
        .then(()=> iDB.root.setProperty("current_wallet", wallet_name))
        .then(()=>{
            // The database must be closed and re-opened first before the current
            // application code can initialize its new state.
            iDB.close()
            ChainStore.clearCache()
            // BalanceClaimActiveStore.reset()
        })
        .then(()=> iDB.init_instance().init_promise )
        .then(()=> wallet)
    }
    
    deleteWallet(wallet_name) {
        if( ! this.state.wallet_names.has(wallet_name) )
            throw new Error("Can't delete wallet '"+ wallet_name + "', does not exist")
        
        var p
        if(this.legacy_wallet_names.has(wallet_name)) {
            var database_name = iDB.getDatabaseName(wallet_name)
            iDB.impl.deleteDatabase(database_name)
            this.legacy_wallet_names = this.legacy_wallet_names.remove(wallet_name)
            p = iDB.root.setProperty("wallet_names", this.legacy_wallet_names)
        }
        else {
            let key = "wallet::" + chain_config.address_prefix
            p = new IndexedDbPersistence( key ).open(wallet_name).then( db => db.clear())
        }
        
        let wallet_names = this.state.wallet_names.remove(wallet_name)
        
        let current_wallet = this.state.current_wallet
        if(current_wallet === wallet_name) {
            current_wallet = wallet_names.size ? wallet_names.first() : undefined
            this.openWallet(current_wallet)
                .then(()=> this.setState({ current_wallet, wallet_names }))
            return
        }
        this.setState({ current_wallet, wallet_names })
        return p
    }
    
    /** Discover derived keys that are not in this wallet */
    checkNextGeneratedKey() {
        
        if( ! wallet ) return // not opened
        if( ! wallet.private_key ) return // locked
        if( ! wallet.wallet_object.has("brainkey")) return // no brainkey
        
        if(
            this.chainstore_account_ids_by_key === ChainStore.account_ids_by_key &&
            this.chainstore_objects_by_id === ChainStore.objects_by_id
        ) return // no change
            
        this.chainstore_account_ids_by_key = ChainStore.account_ids_by_key
        this.chainstore_objects_by_id = ChainStore.objects_by_id
        
        // Helps to ensure we are looking at an un-used key
        try { this.generateNextKey() } catch(e) {
            console.error(e, "stack", e.stack) }
    }
    
    
    /**
        Return a mutable clone of the wallet's data object.  The modified wallet object can be passed back in to this.update(wallet_object) for merging.
        
        Programmers should instead use Immutable data from functions like WalletDb.data() (see constructor for short-hand functions).  If updating, it is better to update the Immutable version `WalletDb.data()` and passed back into this.update(data).  
        
        Store only serilizable types in this object.
        
        @return null if locked or return a mutable wallet object (regular object)
    */
    getWallet() {
        if( this.isLocked() ) return null
        return wallet.wallet_object.toJS()
    }
    
    
    isEmpty() {
        if( ! wallet) return true
        if( this.legacy_wallet_names.has(this.state.current_wallet)) return false
        return wallet.isEmpty()
    }
    
    /** @return {Promise} resolve immediately or after a successful unsubscribe
    */
    logout() {
        if( ! wallet) return
        this.memoCache = Map()
        return wallet.logout().then( ()=> this.setState({ locked: true }) )
    }
    
    isLocked() {
        return ! ( wallet && wallet.private_key )
    }
    
    /** @return PrivateKey or null */
    getPrivateKey(public_key) {
        if(! cwallet) return
        if(! public_key) return null
        return cwallet.getPrivateKey(public_key)
    }
    
    /**
        @arg {TransactionBuilder} tr
        @arg {array} [signer_pubkeys = null] additional signing keys (via balance claim addresses, special cases)
        @arg {boolean} broadcast to the blockchain
        @arg {function} [broadcast_confirmed_callback = null] returns a promise, called after user sees and confirms the transaction.  Returned promise must resolve or it will cancel the broadcast.
    */
    process_transaction(tr, signer_pubkeys, broadcast, broadcast_confirmed_callback = ()=> Promise.resolve()) {
        return WalletUnlockActions.unlock().then( () =>
            this.confirm_transactions ? // confirm_transactions off for unit tests
                tr.process_transaction(cwallet, signer_pubkeys, false/* broadcast */).then(()=>
                    new Promise( resolve => {
                        tr.__resolve = resolve;
                        tr.__broadcast_confirmed_callback = broadcast_confirmed_callback;
                        TransactionConfirmActions.confirm(tr)
                    })
                )
            :
            broadcast_confirmed_callback().then(()=>
                tr.process_transaction(cwallet, signer_pubkeys, broadcast)
            )
        )
    }
    
    getBrainKey() {
        assertLogin()
        return wallet.wallet_object.get("brainkey")
    }
    
    /** Call openWallet first, unless creating the default wallet. */
    onCreateWallet( auth, brainkey ) {
        
        return new Promise( (resolve, reject) => {
            if( auth == null)
                throw new Error("password string is required")
            
            assert(wallet, "Call openWallet first")
            
            var brainkey_backup_date
            if(brainkey) {
                if(typeof brainkey !== "string")
                    throw new Error("Brainkey must be a string")
                
                if(brainkey.trim() === "")
                    throw new Error("Brainkey can not be an empty string")
            
                if(brainkey.trim().length < 50)
                    throw new Error("Brainkey must be at least 50 characters long")

                // The user just provided the Brainkey so this avoids
                // bugging them to back it up again.
                brainkey_backup_date = new Date()
            }
            
            if( ! brainkey)
                brainkey = suggest_brain_key()
            else
                brainkey = key.normalize_brain_key(brainkey)
                
            let chain_id = Apis.instance().chain_id
            resolve(Promise.resolve()
            
                .then(()=> wallet.login(auth.username, auth.password, chain_id)) //login and sync
                
                .then(()=> assert(wallet.wallet_object.get("created"),
                    "Wallet exists: " + this.state.current_wallet))
                
                .then(()=> {
                    let wallet_names = this.state.wallet_names.add(this.state.current_wallet)
                    this.setState({ wallet_names })
                })
                
                .then(()=>
                    wallet.setState({
                        public_name: this.state.current_wallet,
                        brainkey,
                        brainkey_sequence: 0,
                        brainkey_backup_date,
                        chain_id
                    })
                )
                .catch( error => {
                    wallet.logout()
                    throw error
                })
            )
        })
    }
    
    /**
        @return {boolean} true if password matches
        @throws {Error} "Wallet is locked"
    */
    verifyPassword({ password, username = "" }) {
        assertLogin()
        return wallet.verifyPassword(username, password)
    }
    
    login({ password, username = "" }) {
        
        assert(this.isLocked(), "Wallet is already unlocked")
        
        // Check after wallet.login...
        let is_legacy = ()=>
            // Has not been converted already.
            wallet.isEmpty() &&
            // Is or was a legacy wallet.
            this.legacy_wallet_names.has(this.state.current_wallet)
        
        let legacy_upgrade = ()=> {
            return iDB.legacyBackup()
            .then( legacy_backup =>{
                wallet.wallet_object = legacyUpgrade(password, legacy_backup)
                // create the new wallet
                return wallet.login(username, password, Apis.chainId())
            })
        }
        
        return Promise.resolve()
        .then( ()=> 
            is_legacy() ?
                legacy_upgrade() :
                wallet.login(username, password, Apis.chainId())
        )
        // .then( ()=> AccountRefsStore.loadDbData() )// TODO Store can use WalletDb.subscribe instead
        .then( ()=> this.setState({locked: false }) )
    }
    
    /** This will unlock the wallet (if successful). */
    changePassword({ password, username }) {
        return wallet.changePassword( password, username )
    }
    
    /**
        Creates the same set of keys until the keys are saved in the wallet (passed into WalletDb.importKeys).
        
        @arg {number} count
        @return {array} - [{ private_key: PrivateKey, brainkey_sequence: number }]
    */ 
    getDeterministicKeys( count ) {
        var brainkey = this.getBrainKey()
        var sequence = wallet.wallet_object.get("brainkey_sequence") || 0
        let keys = List()
        for(let i = 0; i < count; i++)
            keys = keys.push({
                private_key: key.get_brainkey_private( brainkey, sequence + i ),
                brainkey_sequence: sequence + i
            })
        return keys.toJS()
    }
    
    /** 
        Used in for Advanced mode for brainkey recovery.  This is bound to ChainStore events.
        
        @private
        
        @throws "missing brainkey", "wallet locked"
        @return { private_key, sequence }
    */
    generateNextKey() {
        var brainkey = this.getBrainKey()
        var sequence = wallet.wallet_object.get("brainkey_sequence") || 0
        
        // Skip ahead in the sequence if any keys are found in use.
        // Slowly look ahead (1 new key per block) to keep the wallet fast after unlocking
        this.brainkey_look_ahead = Math.min(10, (this.brainkey_look_ahead||0) + 1)
        
        let keys = []
        for (var i = sequence; i < sequence + this.brainkey_look_ahead; i++) {
            // if( ! this.generateNextKey_pubcache[i]) console.log('WalletDb\tgenerateNextKey', i)
            var private_key = key.get_brainkey_private( brainkey, i )
            var pubkey =
                this.generateNextKey_pubcache[i] ?
                this.generateNextKey_pubcache[i] :
                this.generateNextKey_pubcache[i] =
                private_key.toPublicKey().toPublicKeyString()
            
            var next_key = ChainStore.getAccountRefsOfKey( pubkey )
            
            if(next_key && next_key.size) {
                console.log("WalletDb\tPrivate key sequence " + i + " in-use. " + 
                    "I am saving the private key and will go onto the next one.")
                keys.push({ private_key, brainkey_sequence: i })
            }
        }
        if( keys.length )
            this.importKeys(keys)
    }
    
    /**
        Bulk import of keys, making a single backup.  Keys may be indexed by address.
        @arg {key_object|array<key_object>} key_objects
        @typedef key_object
        @property {string} key_object.public_key - must match key prefix for this chain
        @property {string} key_object.private_wif - or private_key object
        @property {string} key_object.import_account_names - comma separated list
        @property {boolean} key_object.index_address - true|undefined.  Set truthy only if this could be a BTS 1.0 key having a legacy address format (Protoshares, etc.).  Unless true, the user may not see some shorts or balance claims.  A private key object is requred if this is used.
        @property {number} key_object.brainkey_sequence
    */
    importKeys(key_objects) {
        
        this.setState({ saving_keys: true })
        
        let { wallet_object, binaryBackupRecommended } = importKeyWalletObject( wallet.wallet_object, key_objects )
        if(binaryBackupRecommended)
            CachedPropertyActions.set("backup_recommended", true)
        
        let p = wallet.setState(wallet_object)
            .then(()=> this.setState({saving_keys: false}) )
        
        AddressIndex.add( this.keys()
            .reduce( (r, key, pubkey) => key.get("index_address") ? r.push(pubkey) : r, List())
        )
        
        // this.keys().forEach( (key, pubkey) => ChainStore.getAccountRefsOfKey(pubkey) )
        // this.keys().forEach( (key, pubkey) => console.log('imported',pubkey) )
        return p
    }
    
    setWalletModified() {
        return wallet.setState(
            wallet.wallet_object.set("backup_date", new Date().toISOString())
        )
    }
    
    setBackupDate() {
        return wallet.setState(
            wallet.wallet_object.set("backup_date", new Date().toISOString())
        )
    }
    
    setBrainkeyBackupDate() {
        return wallet.setState(
            wallet.wallet_object.set("brainkey_backup_date", new Date().toISOString())
        )
    }
    
    binaryBackupRecommended() {
        CachedPropertyActions.set("backup_recommended", true)
    }
    
    tryRestoreKey(key, username, password) {
        console.log('key', key)
        // WalletDb.restore(
        return Promise.reject("no")
    }
    
    decodeMemo(memo) {
        if( this.isLocked() )
            return
        
        let immMemo = fromJS(memo)
        if(this.memoCache.has(immMemo))
            return this.memoCache.get(immMemo)
        
        let from_private_key = cwallet.getPrivateKey(memo.from)
        let to_private_key = cwallet.getPrivateKey(memo.to)
        let private_key = from_private_key ? from_private_key : to_private_key;
        let public_key = from_private_key ? memo.to : memo.from;
        
        let memo_text;
        try {
            memo_text = private_key ? Aes.decrypt_with_checksum(
                private_key,
                public_key,
                memo.nonce,
                memo.message
            ).toString("utf-8") : null;
        } catch(e) {
            console.log("WalletDb\tdecodeMemo", e);
            memo_text = "*";
        }
        this.memoCache = this.memoCache.set(fromJS(memo), memo_text)
        return memo_text
    }
    
    /** Saves wallet object to disk.  Always updates the last_modified date. */
    update(wallet_object) {
        if ( ! wallet) {
            reject("missing wallet")
            return
        }
        return wallet.setState(wallet_object)
    }
    
    // /** Might be useful when RAM wallets are implemented */
    // hasDiskWallet(name = this.getState().get("current_wallet")) {
    // }
    
}

export var WalletDbWrapped = alt.createStore(WalletDb, "WalletDb");
// WalletDbWrapped.instance = WalletDb
export default WalletDbWrapped

function reject(error) {
    console.error( "----- WalletDb reject error -----", error)
    throw new Error(error)
}

let importKeyWalletObject = (wallet_object, key_objects) => {
    
    if( ! Array.isArray(key_objects) && ! List.isList(key_objects))
        key_objects = [ key_objects ]
    
    let binaryBackupRecommended = false
    
    wallet_object = Map(wallet_object).withMutations( wallet_object => {
        let max_brainkey_sequence = undefined
        List(key_objects).forEach( key_object => {
            
            let {public_key, private_wif, import_account_names, index_address, brainkey_sequence} = key_object
            
            if( ! private_wif ) {
                assert(key_object.private_key, "private_wif or private_key required")
                assert(key_object.private_key.d, "private_key must be of PrivateKey type")
                private_wif = key_object.private_key.toWif()
            }
            
            if( key_object.brainkey_sequence !== undefined)
                max_brainkey_sequence = Math.max(max_brainkey_sequence||0, key_object.brainkey_sequence)
            else
                binaryBackupRecommended = true
            
            if( ! public_key ) {
                assert(private_wif, "Private key required")
                // toPublicKey  S L O W
                public_key = PrivateKey.fromWif(private_wif).toPublicKey().toString()
            } else {
                if(public_key.indexOf(chain_config.address_prefix) != 0)
                    throw new Error("Public Key should start with " + chain_config.address_prefix)
            }
            
            if( index_address ) {
                assert(private_wif, "private key required to derive addresses")
            }
            
            let key = { private_wif }
            
            if(import_account_names != null) key.import_account_names = import_account_names
            if(brainkey_sequence != null) key.brainkey_sequence = brainkey_sequence
            if(index_address != null) key.index_address = index_address
            
            wallet_object.setIn(["keys", public_key], Map(key))
        })
        
        if( max_brainkey_sequence !== undefined)
            // Always point to an unused key
            wallet_object.set("brainkey_sequence", 1 + max_brainkey_sequence)
        
        
    })
    return  { wallet_object, binaryBackupRecommended }
}

export function legacyUpgrade(password, legacy_backup) {

    let legacy_wallet = legacy_backup.wallet[0]
    if( legacy_wallet.chain_id !== Apis.chainId())
        throw new Error("Missmatched chain id, backup has " + legacy_wallet.chain_id + " but this connection is expecting " + Apis.chainId())
    
    let password_private = PrivateKey.fromSeed( password || "" )
    let password_pubkey = password_private.toPublicKey().toString()
    if(legacy_wallet.password_pubkey !== password_pubkey)
        throw new Error("invalid_auth")
    
    console.info("WalletDb\tconverting legacy wallet")
    let aes = Aes.fromSeed( Aes.fromSeed( password ).decryptHexToBuffer( legacy_wallet.encryption_key ) )
    let dt = val => val ? val["toISOString"] ? val.toISOString() : new Date(val).toISOString() : val
    
    let new_wallet = Map({
        public_name: legacy_wallet.public_name,
        created: dt(legacy_wallet.created),
        brainkey: aes.decryptHexToText(legacy_wallet.encrypted_brainkey),
        backup_date: dt(legacy_wallet.backup_date),
        brainkey_backup_date: dt(legacy_wallet.brainkey_backup_date),
        brainkey_sequence: legacy_wallet.brainkey_sequence, 
    })
    let keys = []
    for(let key of legacy_backup.private_keys) {
        let private_buf = aes.decryptHexToBuffer(key.encrypted_key)
        if(private_buf.length === 0) {
            console.log("WalletDb\tWARN empty key", "position " + keys.length)
            continue
        }
        keys.push({
            public_key: key.pubkey,
            private_key: private_buf.length === 0 ? undefined: PrivateKey.fromBuffer(private_buf),
            import_account_names: key.import_account_names ? key.import_account_names.join(", ") : "",
            brainkey_sequence: key.brainkey_sequence,
            index_address: key.brainkey_sequence == null
        })
    }
    console.log("WalletDb\tCollected keys", keys.length, "of", legacy_backup.private_keys.length)
    let { wallet_object, binaryBackupRecommended } = importKeyWalletObject( new_wallet, keys )
    if(legacy_wallet.deposit_keys)
        wallet_object = wallet_object.set("deposit_keys", fromJS(legacy_wallet.deposit_keys))
    
    return wallet_object
}
// getBrainKeyPrivate(brainkey = this.getBrainKey()) {
//     if( ! brainkey) throw new Error("missing brainkey")
//     return PrivateKey.fromSeed( key.normalize_brain_key(brainkey) )
// }

/**
    @arg {string} name of a Map within the wallet
    
    @return Immuable Map from the wallets data object or an emtpy map if locked or non-existent)
*/
function map(wallet, name) {
    assert( name, "name is required")
    if(! wallet || ! wallet.wallet_object) return Map()
    return wallet.wallet_object.get(name, Map())
}

function assertLogin() {
    if( ! wallet || ! wallet.private_key )
        throw new Error("Wallet is locked")
}

function notify() {
    this.subscribers.forEach( callback => {
        try { callback() }
        catch(error) {
            console.error("WalletDb\tnotify" , error, 'stack', error.stack)
        }
    })
}
