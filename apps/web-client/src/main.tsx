import { render } from 'preact';
import { App } from './App';
import './styles/main.css';

const appElement = document.getElementById('app');

if (appElement) {
  render(<App />, appElement);
}


