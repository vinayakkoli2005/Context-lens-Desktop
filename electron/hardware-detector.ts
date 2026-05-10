import os from 'node:os';
import type { HardwareInfo } from '../src/shared/types';

export const recommendModels = (totalRamGb: number): HardwareInfo => {
  if (totalRamGb < 8) {
    return { totalRamGb, recommendedTextModel: 'moondream', recommendedVisionModel: 'moondream' };
  }
  if (totalRamGb <= 16) {
    return { totalRamGb, recommendedTextModel: 'llama3.2', recommendedVisionModel: 'llava' };
  }
  return { totalRamGb, recommendedTextModel: 'llama3.1:8b', recommendedVisionModel: 'llava:13b' };
};

export const detectHardware = (): HardwareInfo => {
  const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
  return recommendModels(totalRamGb);
};
