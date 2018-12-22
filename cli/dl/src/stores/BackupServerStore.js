import alt from "alt-instance"
import { fromJS } from "immutable"
import { rfc822Email, WalletWebSocket } from "@graphene/wallet-client"
import CachedPropertyActions from "actions/CachedPropertyActions"
import WalletDb from "stores/WalletDb"

class BackupServerStore {
    
    constructor() {
        this.init = ()=> ({
            // UI Backup status (will check for wallet.backup_status.xxxx internationalization)
            backup_status: "unknown",
            socket_status: null,
            api_error: null,
        })
        this.state = this.init()
        WalletDb.subscribe(this.onUpdate.bind(this))
        WalletWebSocket.api_status.add(this.onApiError.bind(this))
        WalletWebSocket.socket_status.add(this.onSocketChange.bind(this))
    }
    
    onApiError(api_error) {
        if(api_error)
            console.log('ERROR\tBackupServerStore api_error', api_error)
        
        this.setState({ api_error: api_error ? api_error.message : null })
        this.onUpdate()
    }
    
    onSocketChange(socket_status) {
        // console.log('BackupServerStore\tsocket_status', socket_status)
        this.setState({ socket_status })
        this.onUpdate()
    }
    
    onUpdate() {
        let wallet = WalletDb.getState().wallet
        if(!wallet) {
            this.setState(this.init())
            return
        }

        { // all wallet updates will trigger backup_recommended
            let empty_wallet = wallet.wallet_object.isEmpty()
            // console.log("BackupServerStore\tonUpdate empty_wallet", empty_wallet)
            if( ! this.prev_wallet_object && ! empty_wallet)
                this.prev_wallet_object = wallet.wallet_object
            
            else if(this.prev_wallet_object && this.prev_wallet_object !== wallet.wallet_object) {
                this.prev_wallet_object = wallet.wallet_object
                CachedPropertyActions.set("backup_recommended", true)
                console.log("BackupServerStore\tonUpdate backup_recommended");
            }
        }
        
        let { remote_status, local_status } = wallet // socket_status
        let { remote_url, remote_copy, remote_token } = wallet.storage.state.toJS()
        let { socket_status } = this.state
        // let weak_password  = wallet.wallet_object.get("weak_password")
        
        {// if re-connecting and wallet is unlocked, re-subscribe to wallet updates
            // console.log("BackupServerStore\tonUpdate socket_status", socket_status, "-- was -->", this.prev_socket_status);
            // if(socket_status === "open")
            //     wallet.sync() // causes a mess ending in a local server version conflict
            this.prev_socket_status = socket_status
        }
        
        let backup_status = remote_copy !== true ? "disabled" :
            socket_status !== "open" ? socket_status :
            remote_status !== "Not Modified" ? remote_status :
            "backed_up"
        
        let state = { 
            remote_status, local_status,
            remote_url, remote_copy, remote_token,
            // weak_password, 
            backup_status
        }
        this.setState(state)
        // console.log('BackupServerStore\tstate', state)
    }
    
    
}

export var AltBackupServerStore = alt.createStore(BackupServerStore, "BackupServerStore");
export default AltBackupServerStore
