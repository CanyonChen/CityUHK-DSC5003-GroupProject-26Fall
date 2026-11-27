<script setup>
import { useAdminI18n } from './i18n';

const { language, setLanguage, t } = useAdminI18n();
const options = [
  { code: 'en', lang: 'en', short: 'EN', name: 'English' },
  { code: 'zh-cn', lang: 'zh-CN', short: '简体', name: '简体中文' },
  { code: 'zh-hk', lang: 'zh-HK', short: '繁體', name: '繁體中文' },
];
</script>

<template>
  <div class="admin-language">
    <div class="language-options" role="group" :aria-label="t('shell.language')">
      <button v-for="option in options" :key="option.code" type="button" :lang="option.lang"
        :aria-label="option.name" :aria-pressed="language === option.code" @click="setLanguage(option.code)">
        {{ option.short }}
      </button>
    </div>
    <select :aria-label="t('shell.language')" :value="language" @change="setLanguage($event.target.value)">
      <option v-for="option in options" :key="option.code" :value="option.code"
        :lang="option.lang" :aria-label="option.name">{{ option.short }}</option>
    </select>
  </div>
</template>

<style scoped>
.admin-language { flex: none; }
.language-options {
  display: flex; align-items: center; padding: .14rem; border: 1px solid var(--line);
  border-radius: 2rem; background: var(--backdrop);
}
.language-options button, .admin-language select {
  min-width: 2.75rem; min-height: 2.75rem; padding-inline: .62rem; border: 0;
  border-radius: 2rem; background: transparent; color: var(--ink); font: 675 .83rem/1.2 var(--font);
}
.language-options [aria-pressed="true"] {
  background: var(--surface); color: var(--burgundy); box-shadow: 0 1px 5px #35232c25;
}
.language-options button:active { color: var(--pressed); background: var(--rose); }
.admin-language select { display: none; }
@media (max-width: 40rem) {
  .language-options { display: none; }
  .admin-language select {
    display: block; width: 4.45rem; min-height: 2.75rem; padding: .4rem .3rem .4rem .6rem;
    border: 1px solid var(--line); border-radius: 2rem; background: var(--backdrop);
    color: var(--burgundy); font-size: .85rem;
  }
}
</style>
