/**
 * Labeled control used by the property Editor (number/text/select/color).
 * Font selects render each option in its own face for WYSIWYG picking.
 */
import classes from "./EditorControls.module.css";
import { CANVAS_FONT_STACKS } from "../../../utils/canvasFont";

/** CSS font-family used to preview each option in the font picker. */
const FONT_PREVIEW = CANVAS_FONT_STACKS;

const FONT_OPTIONS = [
    { value: "Inter", label: "Inter" },
    { value: "Roboto", label: "Roboto" },
    { value: "Times-Roman", label: "Times" },
    { value: "Helvetica", label: "Helvetica" },
    { value: "Courier", label: "Courier" },
    { value: "PlayfairDisplay", label: "Playfair Display" },
    { value: "CormorantGaramond", label: "Cormorant Garamond" },
    { value: "Lora", label: "Lora" },
    { value: "Montserrat", label: "Montserrat" },
    { value: "JetBrainsMono", label: "JetBrains Mono" },
];

export default function EditorControls({ labelText, type, inputValue, onChangeFn, isSelect, isDisabled }) {
    const selectFont = FONT_PREVIEW[inputValue] || undefined;

    return (
        <div className={classes.formControl}>
            <label>{labelText}</label>
            {isSelect ? (
                <select
                    value={inputValue}
                    onChange={onChangeFn}
                    style={selectFont ? { fontFamily: selectFont } : undefined}
                >
                    {FONT_OPTIONS.map(({ value, label }) => (
                        <option
                            key={value}
                            value={value}
                            style={{ fontFamily: FONT_PREVIEW[value] }}
                        >
                            {label}
                        </option>
                    ))}
                </select>
            ) : (
                <input type={type} value={inputValue} onChange={onChangeFn} disabled={isDisabled} />
            )}
        </div>
    );
}
