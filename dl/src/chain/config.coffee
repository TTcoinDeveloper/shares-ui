module.exports = _this =
    core_asset: "CORE"
    address_prefix: "GPH"
    expire_in_secs: 15
    expire_in_secs_proposal: 24 * 60 * 60
    depositWithdrawDefaultActiveTab: 0
    networks:
        BitShares:
            core_asset: "MET"
            address_prefix: "MET"
            chain_id: "8c3612a4287c2c9b4e52d094760ae877b0525f94068027c49c4bae5949bfcc94"
        Muse:
            core_asset: "MUSE"
            address_prefix: "MUSE"
            chain_id: "45ad2d3f9ef92a49b55c2227eb06123f613bb35dd08bd876f2aea21925a67a67"
    
    # Auto-configure if a matching chain ID is found
    setChainId: (chain_id) ->
        for network_name in Object.keys(_this.networks)
            network = _this.networks[network_name]
            if( network.chain_id == chain_id )
                _this.network_name = network_name
                _this.address_prefix = network.address_prefix if(network.address_prefix)
                console.log "Configured for", network_name, network
                break
        unless _this.network_name
            console.log "Unknown chain id", chain_id
        return
