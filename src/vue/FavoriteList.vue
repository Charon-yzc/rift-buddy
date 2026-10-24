<template>
 <div v-if="rows.length" class="favorite-list">
  <article v-for="f in rows" :key="f.id" class="favorite-card" :data-favorite-id="f.id">
   <div style="display:flex;justify-content:space-between">
    <span :class="'badge '+(f.type==='hex'?'purple':'green')">{{ f.type==='hex'?'海克斯灵感':f.type==='build'?'英雄配置':'开黑组合' }}</span>
    <button class="favorite-button" data-action="delete-favorite" :data-index="f.index" :aria-label="'删除收藏'+f.title">
     <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>
    </button>
   </div>
   <h3>{{ f.title }}</h3>
   <div style="display:flex;gap:8px;margin-top:12px">
    <template v-for="(cid, position) in heroIds(f)" :key="position">
     <img v-if="hero(cid)" class="portrait sm" :src="data.imageOverrides?.['champion/'+cid]||'../data/images/champion/'+cid+'.png'"
      :data-fallback="hero(cid).icon" :alt="hero(cid).name" loading="lazy" />
     <div v-else class="empty-portrait">+</div>
    </template>
   </div>
   <div v-if="f.buildSummary" v-html="f.buildSummary"></div>
   <div v-if="f.teamSummary" v-html="f.teamSummary"></div>
   <details v-if="f.type==='team'&&f.configurations?.length" class="favorite-team-configurations ui-disclosure">
    <summary>已保存 {{ f.configurations.length }} 位成员配置</summary>
    <section v-for="(selection, member) in f.configurations" :key="member">
     <h4>{{ hero(selection.id)?.name||selection.id }} · {{ roleName(selection.role) }}</h4>
     <div v-html="f.memberSummaries[member]"></div>
     <button type="button" class="btn small" data-action="open-team-build" :data-index="f.index" :data-member="member">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>查看配置
     </button>
    </section>
   </details>
   <p v-if="f.type==='hex'">{{ augmentText(f) }}<br>保存版本 {{ f.version||'未知' }}{{ f.version&&f.version!==dataVersion?' · 当前版本已变化':'' }}</p>
   <p v-else>收藏于 {{ dateLabel(f.createdAt) }}<br>保存版本 {{ f.version||'未知' }}{{ f.version&&f.version!==dataVersion?' · 当前版本已变化':'' }}</p>
   <button type="button" class="btn small" data-action="open-favorite" :data-index="f.index">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>{{ f.type==='team'?'载入开黑成员与配置':'查看收藏' }}
   </button>
   <button v-if="f.type==='team'" type="button" class="btn quiet small" data-action="update-team-favorite" :data-index="f.index">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>用最近选择更新配置
   </button>
  </article>
 </div>
 <section v-else class="panel">
  <div class="empty-state">
   <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>
   <h3>留住想玩的点子</h3>
   <p>在推荐方案、英雄配置或海克斯手册中点击收藏，下次打开就能找到。</p>
   <button type="button" class="btn primary" data-action="go-draft">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>去看看开黑组合
   </button>
  </div>
 </section>
</template>
<script>
import {favoriteBuildSummary, favoriteTeamSummary} from '../favorites-view.mjs';
import {ROLES} from '../core/rules.mjs';
import {hexFavoriteIsCurrent} from '../core/hex-acquisition.mjs';
export default {
 props: { favorites: {type: Array, default: () => []}, data: Object },
 computed: {
  dataVersion() { return this.data?.version || ''; },
  rows() { return this.favorites.flatMap((f,i)=>hexFavoriteIsCurrent(this.data,f)?[{...f,index:i,buildSummary:favoriteBuildSummary(this.data,f),teamSummary:favoriteTeamSummary(this.data,f,i,{includeConfigurations:false}),memberSummaries:f.type==='team'?(f.configurations||[]).map(selection=>favoriteBuildSummary(this.data,{...selection,type:'build',champion:selection.id,version:f.version})):[]}]:[]); },
 },
 methods: {
  heroIds(f) { return (f.type==='team'?(f.slots||[]).filter(s=>s.party).map(s=>s.champion):[f.champion]).filter(Boolean).slice(0,5); },
  hero(id) { return this.data?.champions?.find(c=>c.id===id); },
  roleName(id) { return ROLES.find(role=>role.id===id)?.name||''; },
  augmentText(f) { return (f.augments||[]).map(id=>(this.data?.augments||[]).find(a=>a.id===id)?.name||'旧版强化').join(' · '); },
  dateLabel(v) { return v?new Date(v).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}):'未知'; },
 },
};
</script>
