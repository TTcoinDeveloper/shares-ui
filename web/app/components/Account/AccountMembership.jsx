import React from "react";
import {Link} from "react-router";
import Translate from "react-translate-component";
import FormattedAsset from "../Utility/FormattedAsset";
import LoadingIndicator from "../LoadingIndicator";
import ChainStore from "api/ChainStore";
import ChainTypes from "../Utility/ChainTypes";
import BindToChainState from "../Utility/BindToChainState";
import Statistics from "./Statistics";
import AccountActions from "actions/AccountActions";
import Icon from "../Icon/Icon";
import TimeAgo from "../Utility/TimeAgo";
import HelpContent from "../Utility/HelpContent";
import utils from "common/utils";
import WalletActions from "actions/WalletActions";

@BindToChainState({keep_updating:true})
class AccountMembership extends React.Component {

    static propTypes = {
        account: ChainTypes.ChainAccount.isRequired,
        gprops: ChainTypes.ChainObject.isRequired,
        dprops: ChainTypes.ChainObject.isRequired
    }
    static defaultProps = {
        gprops: "2.0.0",
        dprops: "2.1.0"
    }

    upgradeAccount(id, lifetime, e) {
        e.preventDefault();
        AccountActions.upgradeAccount(id, lifetime);
    }

    _onClaim(e) {
        e.preventDefault();
        let cvb = ChainStore.getObject( this.props.account.get("cashback_vb") );
        
        WalletActions.claimVestingBalance(this.props.account.get("id"), cvb);
    }

    render() {
        let gprops = this.props.gprops;
        let dprops = this.props.dprops;

        let account = this.props.account.toJS();

        let ltr = ChainStore.getAccount( account.lifetime_referrer );
        if( ltr ) account.lifetime_referrer_name = ltr.get('name');
        let ref = ChainStore.getAccount( account.referrer );
        if( ref ) account.referrer_name = ref.get('name');
        let reg = ChainStore.getAccount( account.registrar );
        if( reg ) account.registrar_name = reg.get('name');

        let cvb = account.cashback_vb ? ChainStore.getObject( account.cashback_vb ) : null;

        let cvbAsset, vestingPeriod, remaining, earned, secondsPerDay = 60 * 60 * 24,
            availablePercent;
        
        if (cvb) {
            let balance = cvb.getIn(["balance", "amount"]);
            cvbAsset = ChainStore.getAsset(cvb.getIn(["balance", "asset_id"]));
            earned = cvb.getIn(["policy", 1, "coin_seconds_earned"]);
            vestingPeriod = cvb.getIn(["policy", 1, "vesting_seconds"]);

            availablePercent = earned / (vestingPeriod * balance);
        }
        
        let account_name = account.name;

        let network_fee  = account.network_fee_percentage/100;
        let lifetime_fee = account.lifetime_referrer_fee_percentage/100;
        let referrer_total_fee = 100 - network_fee - lifetime_fee;
        let referrer_fee  = referrer_total_fee * account.referrer_rewards_percentage/10000;
        let registrar_fee = 100 - referrer_fee - lifetime_fee - network_fee;

        gprops = gprops.toJS();
        dprops = dprops.toJS();

        let member_status = ChainStore.getAccountMemberStatus(this.props.account);
        let membership = "account.member." + member_status;
        let expiration = null
        if( member_status === "annual" )
           expiration = (<span>(<Translate content="account.member.expires"/> <TimeAgo time={account.membership_expiration_date} />)</span>)
        let expiration_date = account.membership_expiration_date;
        if( expiration_date === "1969-12-31T23:59:59" )
           expiration_date = "Never"
        else if( expiration_date === "1970-01-01T00:00:00" )
           expiration_date = "N/A"

        let core_asset = ChainStore.getAsset("1.3.0");
        let lifetime_cost = gprops.parameters.current_fees.parameters[8][1].membership_lifetime_fee*gprops.parameters.current_fees.scale/10000;
        let annual_cost = gprops.parameters.current_fees.parameters[8][1].membership_annual_fee*gprops.parameters.current_fees.scale/10000;

        return (
            <div className="grid-content" style={{overflowX: "hidden"}}>
                <div className="content-block">
                    <h3><Translate content={membership}/> {expiration}</h3>
                    { member_status=== "lifetime" ? null : (
                       <div>
                           <div className="large-6 medium-8">
                               <HelpContent path="components/AccountMembership" section="lifetime" feesCashback={100 - network_fee} price={{amount: lifetime_cost, asset: core_asset}}/>
                               { member_status === "annual" ? null : (
                                  <HelpContent path="components/AccountMembership" section="annual" feesCashback={100 - network_fee - lifetime_fee} price={{amount: annual_cost, asset: core_asset}}/>
                               )}
                               <a href className="button no-margin" onClick={this.upgradeAccount.bind(this, account.id, true)}>
                                   <Translate content="account.member.upgrade_lifetime"/>
                               </a> &nbsp; &nbsp;
                               {member_status === "annual" ? null :
                               <a href className="button" onClick={this.upgradeAccount.bind(this, account.id, false)}>
                                   <Translate content="account.member.subscribe"/>
                               </a>}
                            </div>
                       <br/><hr/>
                       </div>
                    )}
                </div>

                <div className="grid-block vertical large-horizontal">
                    <div className="grid-block large-4">
                        <div className="grid-content regular-padding">
                            <h4><Translate content="account.member.fee_allocation"/></h4>
                            <table className="table key-value-table">
                                <tbody>
                                    <tr>
                                        <td><Translate content="account.member.network_percentage"/></td>
                                        <td>{network_fee}%</td>
                                    </tr>
                                    <tr>
                                        <td><Translate content="account.member.lifetime_referrer"/>  &nbsp;
                                        (<Link to={`account/${account.lifetime_referrer_name}/overview`}>{account.lifetime_referrer_name}</Link>)
                                        </td>
                                        <td>{lifetime_fee}%</td>
                                    </tr>
                                    <tr>
                                        <td><Translate content="account.member.registrar"/>  &nbsp;
                                        (<Link to={`account/${account.registrar_name}/overview`}>{account.registrar_name}</Link>)
                                        </td>
                                        <td>{registrar_fee}%</td>
                                    </tr>
                                    <tr>
                                        <td><Translate content="account.member.referrer"/>  &nbsp;
                                        (<Link to={`account/${account.referrer_name}/overview`}>{account.referrer_name }</Link>)
                                        </td>
                                        <td>{referrer_fee}%</td>
                                    </tr>
                                    <tr>
                                        <td><Translate content="account.member.membership_expiration"/> </td>
                                        <td>{expiration_date}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <h4 style={{paddingTop: "1rem"}}><Translate content="account.member.fees_cashback"/></h4>
                            <table className="table key-value-table">
                                <Statistics stat_object={account.statistics}/>
                            </table>
                            <br/>
                            <table className="table key-value-table">
                                {cvb && cvbAsset ? (
                                    <tbody>
            
                                        <tr>
                                            <td><Translate content="account.member.cashback"/> </td>
                                            <td><FormattedAsset amount={cvb.getIn(["balance", "amount"])} asset={cvb.getIn(["balance", "asset_id"])} /></td>
                                        </tr>
                                        <tr>
                                            <td><Translate content="account.member.earned" /></td>
                                            <td>{utils.format_number(utils.get_asset_amount(earned / secondsPerDay, cvbAsset), 0)} <Translate content="account.member.coindays" /></td>
                                        </tr>
                                        <tr>
                                            <td><Translate content="account.member.required" /></td>
                                            <td>{utils.format_number(utils.get_asset_amount(cvb.getIn(["balance", "amount"]) * vestingPeriod / secondsPerDay, cvbAsset), 0)} <Translate content="account.member.coindays" /></td>
                                        </tr>
                                        <tr>
                                            <td><Translate content="account.member.remaining" /></td>
                                            <td>{utils.format_number(vestingPeriod * (1 -  availablePercent) / secondsPerDay, 2)} days</td>
                                        </tr>
                                        <tr>
                                            <td><Translate content="account.member.available" /></td>
                                            <td>{utils.format_number(availablePercent * 100, 2)}% / <FormattedAsset amount={availablePercent * cvb.getIn(["balance", "amount"])} asset={cvbAsset.get("id")} /></td>
                                        </tr>
                                        <tr>
                                            <td colSpan="2" style={{textAlign: "right"}}>
                                                <button onClick={this._onClaim.bind(this)} className="button outline"><Translate content="account.member.claim" /></button>
                                            </td>
                                        </tr>
                                    </tbody>) : null}
                            </table>
                        </div>
                    </div>
                    <div className="grid-block large-1">&nbsp;</div>
                    <div className="grid-block large-7">
                        <div className="grid-content regular-padding">
                            <HelpContent path="components/AccountMembership"
                                         section="fee-division"
                                         account={account_name}
                                         networkFee={network_fee}
                                         referrerFee={referrer_fee}
                                         registrarFee={registrar_fee}
                                         lifetimeFee={lifetime_fee}
                                         referrerTotalFee={referrer_total_fee}
                                         maintenanceInterval={gprops.parameters.maintenance_interval}
                                         nextMaintenanceTime={{time: dprops.next_maintenance_time}}
                                         vestingThreshold={{amount: gprops.parameters.cashback_vesting_threshold, asset: core_asset}}
                                         vestingPeriod={gprops.parameters.cashback_vesting_period_seconds/60/60/24}/>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default AccountMembership;