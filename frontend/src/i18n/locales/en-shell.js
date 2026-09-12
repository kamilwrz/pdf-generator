// Static JSON import works in both native Node tests and Vite development.
import messages from './en-shell.json' with { type: 'json' };
export default messages;
