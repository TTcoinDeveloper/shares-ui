import React from "react";
import ReactDOM from "react-dom";
import {PropTypes, Component} from "react";
import Translate from "react-translate-component";
import notify from "actions/NotificationActions"
import cname from "classnames"
import counterpart from "counterpart"
import CachedPropertyActions from "actions/CachedPropertyActions"
import AccountSelector from "../Account/AccountSelector"
import WalletDb from "stores/WalletDb"

let tabIndex = 2 // AccountCreate -> AccountNameInput is 1

export default class AuthInput extends Component {
    
    static propTypes = {

        email: PropTypes.string,
        username: PropTypes.string,
        password: PropTypes.string,
        confirm: PropTypes.string,
        
        // Focus the top element after mounting
        focus: PropTypes.bool,
        clearOnUnmount: PropTypes.bool,
    }
    
    static defaultProps = {
        focus: true,
        clearOnUnmount: true,
    }
    
    componentDidMount() {
        if( this.props.focus )
            this.focus()
    }
    
    componentWillUnmount() {
        if(this.props.clearOnUnmount)
            this.props.auth.clear()
    }
    
    // componentWillReceiveProps(nextProps) {
    //     if(this.props.auth.api_error && this.last_api_error != this.props.auth.api_error) {
    //         this.last_api_error = this.props.auth.api_error
    //         notify.error(counterpart.translate("wallet." + this.props.auth.api_error))
    //         // draw them back into the backup screen
    //         CachedPropertyActions.set("backup_recommended", true)//ALT: Invariant Violation: Dispatch.dispatch(...): Cannot dispatch in the middle of a dispatch.
    //     }
    // }
    
    render() {
        this.props.auth.setup()
        let { hasPassword, hasUsername, hasEmail } = this.props.auth.config()
        return (
            <div>
                { hasUsername ? this.usernameForm(this.props.auth) : null}
                { hasPassword ? this.passwordForm(this.props.auth) : null} <br/>
                { hasEmail ? this.emailForm(this.props.auth) : null}
                <p className="has-error">
                    <Translate content={ this.props.auth.auth_error ? "wallet.invalid_auth" : null }/>
                </p>
            </div>
        );
    }
    
    focus() {
        let { hasPassword, hasUsername, hasEmail } = this.props.auth.config()
        if( hasUsername )
            ReactDOM.findDOMNode(this.refs.auth_username).focus()
        else if( hasPassword  )
            ReactDOM.findDOMNode(this.refs.auth_password).focus()
        else if( hasEmail )
            ReactDOM.findDOMNode(this.refs.auth_email).focus()
    }
    
    passwordForm({password, confirm, password_valid, password_error}) {
        
        let passwordChange = event => this.props.auth.update({ password: event.target.value })
        let confirmChange = event => this.props.auth.update({ confirm: event.target.value })
        let { hasConfirm } = this.props.auth.config()
        
        // "grid-content", "no-overflow", 
        return <div className={cname("form-group", "no-margin", {"has-error": password_error != null })}>
        
            {/*  P A S S W O R D  */}
            <div>
                {/* toUpperCase is for testing, FF and Chrome clipboard label as Password and PASSWORD resp.*/}
                <label>{counterpart.translate("wallet.password").toUpperCase()}</label>
                <input type="password" value={password} onChange={passwordChange.bind(this)} tabIndex={tabIndex++}
                    id="auth_password" ref="auth_password" autoComplete="off"/>
            </div>
            
            {/* C O N F I R M */}
            { hasConfirm ?
            <div>
                <label>{counterpart.translate("wallet.confirm").toUpperCase()}</label>
                <input type="password" value={confirm} onChange={confirmChange.bind(this)} id="auth_confirm" tabIndex={tabIndex++} />
            </div> :null}
            <p className="has-error">
                <Translate content={ password_error ? "wallet." + password_error : null }/>
            </p>
        </div>
    }
    
    emailForm({ email }) {
        let emailChange = event => this.props.auth.update({ email: event.target.value })
        return <div className={cname("form-group", "no-margin", {"has-error": false})}>
            <div>
                <Translate component="label" content="wallet.email" />
                <input id="email" type="text" value={email} onChange={emailChange.bind(this)} autoComplete="on" tabIndex={tabIndex++} ref="auth_email"/>
            </div>
            { this.props.auth.email_valid ? null :
            <p className="has-error">
                <Translate content={this.props.auth.email_error}/>
            </p>}
        </div>
    }

    usernameForm({ username }) {
        let userChange = event => this.props.auth.update({ username: event.target.value })
        return <div className={cname("form-group", "no-margin", {"has-error": false})}>
            <div>
                <Translate component="label" content="wallet.username" />
                <input id="username" type="text" value={username} onChange={userChange.bind(this)} autoComplete="on" tabIndex={tabIndex++} ref="auth_username"/>
            </div>
            { this.props.auth.username_valid ? null :
            <p className="has-error">
                <Translate content={this.props.auth.username_error}/>
            </p>}
        </div>
    }
    
}