interface InputSectionProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

const InputSection = ({ value, onChange, onSubmit }: InputSectionProps) => {
  return (
    <div className="input-section">
      <input 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="[ press SPACE to speak, or type here ]"
        onKeyDown={(e) => { 
          if (e.key === 'Enter') {
            onSubmit(value);
            (e.target as HTMLInputElement).blur(); 
          } 
        }}
      />
    </div>
  );
};

export default InputSection;
