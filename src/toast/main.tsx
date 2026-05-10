import React from 'react';
import { createRoot } from 'react-dom/client';
import '../panel/styles.css';
import { ScreenshotToast } from './ScreenshotToast';

createRoot(document.getElementById('root')!).render(<ScreenshotToast />);
