import React from 'react';
import { createRoot } from 'react-dom/client';
import { VoiceOverlay } from './VoiceOverlay';
import '../panel/styles.css';

createRoot(document.getElementById('root')!).render(<VoiceOverlay />);
