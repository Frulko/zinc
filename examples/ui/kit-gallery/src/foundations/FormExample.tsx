import { createSignal } from 'zinc:ui/solid';
import { Form, Input, Button, heading, captionText } from 'zinc:ui/kit';

export function FormExample(): i32 {
  const [name, setName] = createSignal('Paper circuits');
  const [result, setResult] = createSignal('Enter in the field saves the workshop name.');
  const save = (): void => setResult(name().trim() === '' ? 'Enter a workshop name.' : 'Saved workshop: ' + name());
  return <Form name="workshop" onSubmit={save} className="w-full max-w-[420px]">
    <Text className={heading(4)}>Form</Text>
    <Input name="workshop" label="Workshop name" value={name} onInput={setName} />
    <Button label="Save workshop" type="submit" onClick={save} />
    <Text role="status" className={captionText()}>{result()}</Text>
  </Form>;
}
