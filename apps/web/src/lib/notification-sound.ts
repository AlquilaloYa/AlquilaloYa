let notificationAudioContext: AudioContext | null = null;

/**
 * Emite un sonido sutil y profesional de notificación utilizando la Web Audio API.
 * No depende de assets externos y funciona en todos los navegadores modernos.
 */
export function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    if (!notificationAudioContext) {
      notificationAudioContext = new AudioCtx();
    }
    const context = notificationAudioContext;
    const resume =
      context.state === "suspended" ? context.resume() : Promise.resolve();
    void resume.then(() => {
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      gain.connect(context.destination);

      // Dos tonos armónicos limpios (880Hz La5 y 1174.66Hz Re6)
      [880, 1174.66].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(now + index * 0.14);
        oscillator.stop(now + 0.28 + index * 0.14);
      });
    });
  } catch {
    /* El navegador puede suspender el audio hasta que el usuario interactúe con la app */
  }
}
