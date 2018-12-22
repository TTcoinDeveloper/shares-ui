import React from "react";
import Trigger from "react-foundation-apps/src/trigger";
import Modal from "react-foundation-apps/src/modal";
import Icon from "../Icon/Icon";

class TransferReceiptModal extends React.Component {

    static propTypes = {
        id: React.PropTypes.string,
        value: React.PropTypes.string
    };

    constructor(props) {
        super(props);
        this._selectAndCopy = this._selectAndCopy.bind(this);
        this._copyToClipboard = this._copyToClipboard.bind(this);
    }

    _selectAndCopy() {
        const t_receipt = document.getElementById("t_receipt");
        t_receipt.focus();
        t_receipt.select();
    }

    _selectElementText(el) {
        const range = document.createRange();
        range.selectNode(el);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    _copyToClipboard(e) {
        e.preventDefault();
        this._selectElementText(this.refs.t_receipt);
        document.execCommand("copy");
        window.getSelection().removeAllRanges();
    }

    render() {
        const {value, id} = this.props;
        return (<Modal id={id} overlay>
            <Trigger close={id}>
                <a href="#" className="close-button">&times;</a>
            </Trigger>
            <h3>Transfer Receipt</h3>
            <div style={{paddingTop: "1rem"}}>
                <div className="form-group">
                    <textarea ref="t_receipt" id="t_receipt" rows="5" cols="50" value={value} autoFocus readOnly onClick={this._selectAndCopy} />
                </div>
                <div className="button-group">
                    <Trigger close={id}><a href className="button">Close</a></Trigger>
                    <button className="button outline" onClick={this._copyToClipboard}>Copy to Clipboard</button>
                </div>
            </div>
        </Modal>);
    }

}

export default TransferReceiptModal;
