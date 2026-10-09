import { useState } from "react";
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const onChange = e => {
    const { name, value, type, checked } = e.target;
    setValues(v => ({ ...v, [name]: type === "checkbox" ? checked : value }));
  };
  const reset = () => setValues(initial);
  const set = updates => setValues(v => ({ ...v, ...updates }));
  return { values, onChange, reset, set };
}
