import classes from "./EditorControls.module.css";

export default function EditorControls({ labelText, type, inputValue, onChangeFn, isSelect, isDisabled }) {
    return <div className={classes.formControl}>
        <label>{labelText}</label>
        {isSelect
            ? <select value={inputValue} onChange={onChangeFn}>
                <option value="Times-Roman" >Times-Roman</option>
                <option value="Helvetica" >Helvetica</option>
                <option value="Courier" >Courier</option>
                <option value="Inter" >Inter</option>
                <option value="Roboto" >Roboto</option>
                <option value="PlayfairDisplay" style={{ fontFamily: "PlayfairDisplay" }}>Playfair Display</option>
                <option value="CormorantGaramond" style={{ fontFamily: "CormorantGaramond" }}>Cormorant Garamond</option>
                <option value="Lora" style={{ fontFamily: "Lora" }}>Lora</option>
                <option value="Montserrat" style={{ fontFamily: "Montserrat" }}>Montserrat</option>
                <option value="JetBrainsMono" style={{ fontFamily: "JetBrainsMono" }}>JetBrains Mono</option>
            </select>
            : <input type={type} value={inputValue} onChange={onChangeFn} disabled={isDisabled}/>}
    </div>
}