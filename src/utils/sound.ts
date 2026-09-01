import { useSettingsStore } from '../store/useSettingsStore';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    frequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.2
  ) {
    try {
      const ctx = this.getContext();
      if (!ctx || !this.gainNode) return;

      // Read settings from centralized store
      const settings = useSettingsStore.getState();
      if (!settings.sound.master) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + duration);

      // Apply global volume * individual sound volume
      const globalVolume = settings.sound.volume;
      gain.gain.setValueAtTime(volume * globalVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.gainNode!);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio playback fails safely if unpermitted
    }
  }

  playMove() {
    const settings = useSettingsStore.getState();
    if (!settings.sound.move) return;
    this.playTone(320, 140, 0.07, 'triangle', 0.12);
  }

  playCapture() {
    const settings = useSettingsStore.getState();
    if (!settings.sound.capture) return;
    this.playTone(520, 90, 0.1, 'sine', 0.22);
  }

  playCheck() {
    const settings = useSettingsStore.getState();
    if (!settings.sound.check) return;
    this.playTone(880, 440, 0.15, 'square', 0.15);
  }

  playGameEnd() {
    const settings = useSettingsStore.getState();
    if (!settings.sound.gameEnd) return;
    // Play a sequence of tones for game end
    this.playTone(660, 330, 0.2, 'sine', 0.2);
    setTimeout(() => this.playTone(520, 260, 0.2, 'sine', 0.15), 150);
    setTimeout(() => this.playTone(440, 220, 0.3, 'sine', 0.1), 300);
  }
}

export const sound = new SoundEngine();
