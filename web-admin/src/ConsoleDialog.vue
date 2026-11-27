<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({ label: { type: String, required: true } });
defineEmits(['dismiss']);
const dialog = ref(null);
onMounted(() => dialog.value.showModal());
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <dialog ref="dialog" class="modal-backdrop" :aria-label="label" @cancel.prevent="$emit('dismiss')" @click.self="$emit('dismiss')">
    <slot />
  </dialog>
</template>
