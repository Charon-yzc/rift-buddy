<template>
 <KeepAlive :max="5"><HistoryTabCards :key="tab" :items="items" :empty="empty" /></KeepAlive>
</template>
<script>
// Each player tab keeps its card DOM while another tab is shown. KeepAlive
// moves an inactive tab's nodes out of the document, so the same game in two
// tabs never duplicates element ids, and returning to a tab re-attaches its
// cards (with open disclosures) instead of parsing their HTML again.
import HistoryTabCards from '../generated/HistoryTabCards.mjs';
export default {
 components: {HistoryTabCards},
 props: {tab: {type: [Number, String], default: 0}, items: {type: Array, default: () => []}, empty: String},
};
</script>
