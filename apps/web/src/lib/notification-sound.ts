let notificationAudioContext: AudioContext | null = null;

function getNotificationAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  notificationAudioContext ??= new AudioCtx();
  return notificationAudioContext;
}

export async function unlockNotificationAudio(): Promise<void> {
  const context = getNotificationAudioContext();
  if (!context || context.state !== "suspended") return;
  await context.resume();
}

/**
 * Emite un sonido sutil y profesional de notificación utilizando la Web Audio API.
 * No depende de assets externos y funciona en todos los navegadores modernos.
 */
export function playNotificationChime() {
  const context = getNotificationAudioContext();
  if (!context) return;

  const play = () => {
    try {
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
    } catch (error) {
      console.warn("No se pudo reproducir el sonido de notificación:", error);
    }
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch((error: unknown) => {
      console.warn(
        "El navegador bloqueó el sonido de notificación hasta que se interactúe con la app:",
        error,
      );
    });
  } else {
    play();
  }
}
