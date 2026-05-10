import React from 'react';
import { createRoot } from 'react-dom/client';
import '../panel/styles.css';
import { Settings } from './Settings';

createRoot(document.getElementById('root')!).render(<Settings />);
