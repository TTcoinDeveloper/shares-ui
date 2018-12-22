import React from "react";
import Trigger from "react-foundation-apps/src/trigger";
import Modal from "react-foundation-apps/src/modal";
import AccountActions from "actions/AccountActions";
import ZfApi from "react-foundation-apps/src/utils/foundation-api";
import AccountNameInput from "../Forms/AccountNameInput";
import PrivateKeyInput from "../Forms/PrivateKeyInput";

class CreatePrivateAccountModal extends React.Component {

    constructor(props) {
        super(props);
        this.state = {label: null, key: null};
        
        ZfApi.subscribe("add_private_account_modal", (name, msg) => {
            if(name !== "add_private_account_modal") return
            if (msg === "open") { setTimeout(()=> this.refs.label.focus(), 100) }
        })
        
        this._onCreateClick = this._onCreateClick.bind(this);
        this._onLabelChange = this._onLabelChange.bind(this);
        this._onKeyChange = this._onKeyChange.bind(this);
    }
    
    clear() {
        this.refs.label.clear();
        //this.refs.key.clear();
        this.setState({label: null, key: null});
    }

    _onCreateClick(e) {
        if(e) e.preventDefault();
        ZfApi.publish("add_private_account_modal", "close");
        const label = this.state.label.slice(1);
        try {
            AccountActions.addPrivateAccount(label);
        }
        catch (error) {
            console.error("-- CreatePrivateAccountModal._onCreateClick -->", error);
            notify.error(error);
        }
    }

    _onLabelChange({value}) {
        if (!value) return;
        this.setState({label: value});
    }

    _onKeyChange(key) {
        this.setState({key});
    }

    render() {
        const submit_btn_class = !this.state.label || !this.refs.label.valid() ? "button disabled" : "button";

        return (<Modal id="add_private_account_modal" overlay>
            <Trigger close="add_private_account_modal">
                <a href="#" className="close-button">&times;</a>
            </Trigger>
            <h3>Create Private Account</h3>
            <form style={{paddingTop: "1rem"}} autoComplete="off">
                <div className="form-group">
                    <AccountNameInput ref="label" cheapNameOnly={false}
                        onChange={this._onLabelChange}
                        onEnter={this._onCreateClick}
                        accountShouldNotExist={false}
                        prefixSymbol="~"
                        labelMode
                    />
                </div>
                {/*<PrivateKeyInput ref="key" onChange={this._onKeyChange} />*/}
                <div className="button-group">
                    <a className={submit_btn_class} href onClick={this._onCreateClick}>Create Account</a>
                    <Trigger close="add_private_account_modal"><a href className="secondary button">Cancel</a></Trigger>
                </div>
            </form>
        </Modal>);
    }

}

export default CreatePrivateAccountModal;
