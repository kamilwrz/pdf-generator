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
            </select>
            : <input type={type} value={inputValue} onChange={onChangeFn} disabled={isDisabled}/>}
    </div>
}