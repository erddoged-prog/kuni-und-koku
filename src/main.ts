import './ui/style.css';
import { App } from './ui/app';
import { standardAi } from './ai';

const app = new App(document.getElementById('app')!, standardAi);
app.start();
