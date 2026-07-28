import classes from "./EditorControls.module.css";

/** CSS font-family used to preview each option in the font picker. */
const FONT_PREVIEW = {
    "Times-Roman": "Times-Roman, 'Times New Roman', Times, serif",
    Helvetica: "Helvetica, Arial, sans-serif",
    Courier: "Courier, 'Courier New', monospace",
    Inter: "Inter, sans-serif",
    Roboto: "Roboto, sans-serif",
    PlayfairDisplay: "PlayfairDisplay, serif",
    CormorantGaramond: "CormorantGaramond, serif",
    Lora: "Lora, serif",
    Montserrat: "Montserrat, sans-serif",
    JetBrainsMono: "JetBrainsMono, monospace",
};

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
