import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/700.css';
import { mountExplore } from './ui/explore/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
mountExplore(root);
