import { render } from 'preact';
import { App } from './App';
import './styles/main.css';

const appElement = document.getElementById('app');

if (appElement) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- App component is properly typed JSX element
  render(<App />, appElement);
}
