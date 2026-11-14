<template>
 <div v-for="item in items" :key="item.id" v-preserve-history-card="item.html" class="history-card-host" v-html="item.html"></div>
 <div v-if="!items.length" class="history-empty">{{ empty }}</div>
</template>
<script>
import {preserveHistoryCard} from '../vue/history-card-state.mjs';
export default {
 name: 'HistoryTabCards',
 directives: {preserveHistoryCard},
 props: {items: {type: Array, default: () => []}, empty: String},
};
</script>
