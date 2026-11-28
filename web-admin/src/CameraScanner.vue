<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAdminI18n } from './i18n';
const { t } = useAdminI18n();
const emit = defineEmits(['detected']);
const video = ref(null);
const active = ref(false), starting = ref(false), error = ref(''), message = ref('');
let stream = null, frame = null, generation = 0, lastScan = 0;
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

function stop() {
  generation++;
  active.value = false;
  starting.value = false;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  if (video.value) video.value.srcObject = null;
}
function hidden() { if (document.hidden) stop(); }

async function start() {
  stop();
  error.value = '';
  message.value = '';
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { error.value = 'ops.cameraUnavailable'; return; }
  const run = generation;
  starting.value = true;
  try {
    await nextTick();
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (run !== generation) { media.getTracks().forEach(track => track.stop()); return; }
    stream = media;
    const { default: decode } = await import('./vendor/jsqr.js');
    if (run !== generation) return;
    video.value.srcObject = media;
    await video.value.play();
    if (run !== generation) return;
    active.value = true;
    message.value = 'ops.cameraScanning';
    function scan(time) {
      if (!active.value || run !== generation) return;
      const source = video.value;
      if (time - lastScan >= 180 && source?.readyState >= 2 && source.videoWidth && context) {
        lastScan = time;
        const scale = Math.min(1, 960 / source.videoWidth);
        canvas.width = Math.round(source.videoWidth * scale);
        canvas.height = Math.round(source.videoHeight * scale);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const qr = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
        const value = qr?.data?.trim();
        if (value && value.length <= 4096) {
          stop();
          message.value = 'ops.cameraRead';
          emit('detected', value);
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    }
    frame = requestAnimationFrame(scan);
  } catch (cause) {
    if (run !== generation) return;
    stop();
    error.value = cause.name === 'NotAllowedError' ? 'ops.cameraDenied'
      : cause.name === 'NotFoundError' ? 'ops.cameraMissing' : 'ops.cameraFailed';
  } finally { if (run === generation) starting.value = false; }
}
onMounted(() => document.addEventListener('visibilitychange', hidden));
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', hidden); stop(); });
</script>

<template>
  <section class="camera-scanner" :aria-label="t('ops.cameraTitle')">
    <h3>{{ t('ops.cameraTitle') }}</h3>
    <p class="muted">{{ t('ops.cameraPrivacy') }}</p>
    <button v-if="!active && !starting" type="button" class="primary-button" @click="start">{{ t('ops.cameraStart') }}</button>
    <button v-else type="button" class="ghost-button" @click="stop">{{ t(starting ? 'ops.cameraCancel' : 'ops.cameraStop') }}</button>
    <video v-show="active || starting" ref="video" autoplay muted playsinline :aria-label="t('ops.cameraPreview')"></video>
    <p v-if="error" class="form-error" role="alert">{{ t(error) }}</p>
    <p v-else-if="message" role="status">{{ t(message) }}</p>
  </section>
</template>
<style scoped>
.camera-scanner { grid-column: 1 / -1; width: 100%; border-top: 1px solid var(--line, #ddd); padding-top: 1rem; }
.camera-scanner video { display: block; width: min(100%, 36rem); max-height: 28rem; margin-top: 1rem; border-radius: .6rem; background: #111; object-fit: contain; }
</style>
