import { Apis } from "@graphene/chain"
import { ChainStore } from "@graphene/chain"
import { Aes, PrivateKey, PublicKey, key, ecc_config } from "@graphene/ecc"

import WalletDb from 'stores/WalletDb'
import WalletManagerStore from 'stores/WalletManagerStore'
import BackupServerStore from 'stores/BackupServerStore'
import AccountStore from 'stores/AccountStore'

import BackupActions from "actions/BackupActions"
import WalletActions from "actions/WalletActions"
import SettingsActions from "actions/SettingsActions"

import alt from 'alt-instance'
import iDB from 'idb-instance'
import { chain_config } from "@graphene/chain"

import AccountRefsStore from "stores/AccountRefsStore"
import { AddressIndex } from "@graphene/wallet-client"

module.exports = {
    
    PrivateKey, PublicKey, Aes,
    WalletDb, ChainStore,
    
    // For debugging, these may be moved
    chain_config, ecc_config, key,
    WalletManagerStore, WalletActions, AccountStore, 
    AccountRefsStore, AddressIndex,
    SettingsActions, BackupActions,
    BackupServerStore,
    
    alt, iDB,  Apis,
    db: ()=> Apis.instance().db_api(),
    
    resolve: (object, atty = "_") => {
        if( ! object["then"]) {
            console.log(object)
            return object
        }
        return new Promise( (resolve, reject) => {
            object.then( result => {
                console.log(result)
                resolve(result)
                window[atty] = result
            }).catch( error => {
                console.error(error)
                reject(error)
                window[atty] = error
            })
        })
    },
    
    init: context => {
        if( ! context) return
        for (var obj in module.exports) {
            if(obj === "init") continue
            context[obj] = module.exports[obj]
        }
    },
    
}
