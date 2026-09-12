// Static JSON import works in both native Node tests and Vite development.
import messages from './pl-workspace.json' with { type: 'json' };
export default messages;
