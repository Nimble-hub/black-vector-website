"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <span className="password-input">
      <input {...props} id={id} type={visible ? "text" : "password"} />
      <button type="button" className="password-visibility" aria-controls={id} aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>
        {visible ? "HIDE" : "SHOW"}
      </button>
    </span>
  );
}
