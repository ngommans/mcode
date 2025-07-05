import { render } from 'preact';
import { App } from './App';
import './styles/main.css';
import '@mcode/ui-base';

const appElement = document.getElementById('app');

if (appElement) {
  render(<App />, appElement);
}


