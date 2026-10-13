import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/700.css';
import { mountPresentation } from './ui/present/shell';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
mountPresentation(root);
