<script setup lang="ts">
import ElementPlusTable from './component/element-plus/table.vue'
import ElementPlusTableTsx from './component/element-plus/table.tsx'
import NaiveUiTable from './component/naive-ui/table.vue'
import NaiveUiTableTsx from './component/naive-ui/table.tsx'
import NanostoresCounter from './component/nanostores-counter/counter.vue'
import NanostoresCounter2 from './component/nanostores-counter2/counter.vue'
import { NMessageProvider, NConfigProvider } from 'naive-ui'
</script>

<template>
  <div>nanostores-counter counter.vue</div>
  <NanostoresCounter />
  <NanostoresCounter />
  <hr>
  <div>nanostores-counter2 counter.vue</div>
  <NanostoresCounter2 />
  <NanostoresCounter2 />
  <hr>
  <div>element-plus table.vue</div>
  <ElementPlusTable />
  <hr>
  <div>element-plus table.tsx</div>
  <ElementPlusTableTsx />
  <hr>
  <n-config-provider>
    <n-message-provider>
      <div>naive-ui table.vue</div>
      <NaiveUiTable />
    </n-message-provider>
    <n-message-provider>
      <div>naive-ui table.tsx</div>
      <NaiveUiTableTsx />
    </n-message-provider>
  </n-config-provider>
</template>