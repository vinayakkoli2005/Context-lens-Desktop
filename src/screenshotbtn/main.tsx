import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScreenshotBtn } from './ScreenshotBtn';
import '../panel/styles.css';

createRoot(document.getElementById('root')!).render(<ScreenshotBtn />);
