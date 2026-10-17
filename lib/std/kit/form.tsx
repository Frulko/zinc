/** @jsxHelpers ./host */
// zinc:ui/kit — Form: the group of fields that is submitted as one. On the page (web target, `--render dom`) it is a real <form>: the browser submits it on Enter in a
// field (after its own validation: required, pattern, minLength), fills it from the password manager and autofill, and reports what is invalid. On a desktop or a phone it is a column
// of fields that routes Enter in a single-line field to `onSubmit`. A button with `type="submit"` submits it in the page (its onClick runs too).
//
//   <Form onSubmit={save} className="w-80">
//     <Input name="email" type="email" autoComplete="email" required value={email()} onInput={setEmail} />
//     <Input name="password" type="password" autoComplete="current-password" required value={pw()} onInput={setPw} />
//     <Button label="Sign in" type="submit" />
//   </Form>
import { renderSlot } from './host';

export interface FormProps {
  onSubmit?: () => void;
  name?: string;        // the form's name (autofill groups fields by it)
  action?: string;      // a form with an action and no onSubmit is submitted by the browser to that address
  method?: string;
  className?: string;
  children?: () => i32;
}

export function Form(props?: FormProps): i32 {
  return <View as="form" role="form" name={props?.name ?? ''} action={props?.action ?? ''} method={props?.method ?? ''} className={`flex-col gap-3 ${props?.className ?? ''}`}
    onSubmit={() => { const f = props?.onSubmit; if (f !== undefined) f(); }}>
    {renderSlot(props?.children)}
  </View>;
}
