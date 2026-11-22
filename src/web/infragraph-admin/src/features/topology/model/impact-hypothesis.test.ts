import { describe, it, expect } from 'vitest'
import { sharedParentHypothesis, leadingHypothesis } from './impact-hypothesis'
import type { TopologyDataset, Device } from './topology'
const device = (id: string, state: Device['state'], kind: Device['kind'] = 'workstation') => ({
  id, state, kind, name:id, title:id, address:'', vendor:'', site:'', port:'', description:'', evidence:'',
})
const fixture: TopologyDataset = {
  origin:'synthetic', observedAt:null, nodes:[],
  devices:[device('core','healthy','switch'),device('sw','critical','switch'),device('pc1','unknown'),device('pc2','unknown'),device('up','healthy')],
  edges:[{id:'a',source:'core',target:'sw'},{id:'b',source:'sw',target:'pc1'},{id:'c',source:'sw',target:'pc2'},{id:'d',source:'core',target:'up'}],
}
describe('impact hypothesis is not outage confirmation', () => {
  it('groups unknown dependent endpoints under a critical parent', () => {
    expect(sharedParentHypothesis(fixture,'sw')).toEqual({parentId:'sw',unknownIds:['pc1','pc2'],count:2,confidence:'hypothesis'})
    expect(leadingHypothesis(fixture)?.parentId).toBe('sw')
  })
  it('does not assign healthy device as failed or invent a root cause', () => {
    expect(sharedParentHypothesis(fixture,'core')).toBeNull()
    expect(sharedParentHypothesis({...fixture,devices: fixture.devices.map(d=>d.id==='sw'?{...d,state:'healthy' as const}:d)},'sw')).toBeNull()
  })
  it('is bounded under malformed cyclic edges', () => {
    const cyclic={...fixture,edges:[...fixture.edges,{id:'loop',source:'pc1',target:'sw'}]}
    expect(sharedParentHypothesis(cyclic,'sw')?.count).toBe(2)
  })
})
