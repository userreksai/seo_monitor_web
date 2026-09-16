import test from 'node:test';
import assert from 'node:assert/strict';
import { weightSourceLabel, weightStatus, weightUsable, canConnectWeights } from '../src/metric-source.ts';
const metric = (source, day, valid=true) => ({weight_source:source,weight_valid:valid,baidu_pc_weight:0,baidu_mobile_weight:0,snapshot_date:day+'T00:00:00Z'});
test('source labels and valid zero weights',()=>{
 assert.equal(weightSourceLabel(metric('aizhan','2026-09-16')),'爱站');
 assert.equal(weightSourceLabel(metric('chinaz','2026-09-16')),'站长之家');
 assert.equal(weightUsable(metric('chinaz','2026-09-16')),true);
 assert.equal(weightUsable(metric('chinaz','2026-09-16',false)),false);
 assert.match(weightStatus(metric('chinaz','2026-09-16',false)),/保留旧值/);
 assert.equal(weightSourceLabel(undefined),'来源未确认');
});
test('trend only connects consecutive valid days from the same source',()=>{
 for(const source of ['aizhan','chinaz'])assert.equal(canConnectWeights(metric(source,'2026-09-15'),metric(source,'2026-09-16')),true);
 assert.equal(canConnectWeights(metric('chinaz','2026-09-15'),metric('aizhan','2026-09-16')),false);
 assert.equal(canConnectWeights(metric('aizhan','2026-09-14'),metric('aizhan','2026-09-16')),false);
 assert.equal(canConnectWeights(metric('aizhan','2026-09-15',false),metric('aizhan','2026-09-16')),false);
 assert.equal(canConnectWeights(undefined,metric('aizhan','2026-09-16')),false);
});
