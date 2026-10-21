// The runner of a process in Claude Code's Workflow tool: one script for every process, reading SPEC (the
// process, agents/stages/<process>.json) and MODELS (the model classes in Claude Code's names), both written
// before it in the generated file. It is the Workflow tool's JavaScript (its globals args, agent, pipeline, phase,
// log), text the kit writes out, not the kit's code; its semantics are README.md's, A process's stages: after
// a stage's run, its stop-if (but then failed) and skip-if; then its agents; then its then, and stop-if then failed.
export const RUNNER = String.raw`
// args (all optional): stages, the stages to run in order (default SPEC.order); and any of SPEC.params by name
const A = args || {}
const param = (n) => (A[n] !== undefined ? A[n] : SPEC.params[n].default)
const modelOf = (m) => {
  if (m === undefined || m === 'session') return undefined
  const v = typeof m === 'string' ? param(m) : m
  const c = typeof v === 'string' ? v : v.model
  return MODELS[c] || c
}
const schemaOf = (r) => ({
  type: 'object',
  properties: Object.fromEntries(Object.entries(SPEC.results[r]).map(([k, f]) => [k, { type: f.type, description: f.for }])),
  required: Object.keys(SPEC.results[r]),
})
const fill = (t, vars) =>
  t.replace(/\{(\w+)(?::(\d+))?\}/g, (_, k, w) => (w ? String(vars[k]).padStart(Number(w), '0') : String(vars[k])))

// a task's label: the stage and the values it goes over (not a range's index), padded as the task writes them
const label = (s, v) => {
  const keys = !s.over ? [] : s.over.ranges ? s.over.as : [s.over.as]
  const width = (k) => { const m = s.task.match(new RegExp('\\{' + k + ':(\\d+)\\}')); return m ? Number(m[1]) : 0 }
  return (s.name + ' ' + keys.map((k) => String(v[k]).padStart(width(k), '0')).join('–')).trim()
}

// a run: commands given to a small model, told to run exactly them
const runCommands = (title, commands, count) => agent(
  'From the repository root, run exactly these commands, one after another, and change nothing else:\n' +
  commands.join('\n') + '\n' +
  'Return the last lines each printed, exactly; whether all exited 0; and, as count, ' + count + '.',
  { label: title, phase: title, schema: schemaOf('run'), model: MODELS.small, effort: 'low', agentType: 'general-purpose' })

const counts = {}
const parts = {}
const holds = (when, name, st) => {
  if (when === 'run failed') return !st.run || !st.run.pass
  if (when === 'then failed') return !st.then || !st.then.pass
  if (when === 'no parts') return !parts[name]
  const m = when.match(/^count of (\S+) is 0$/)
  return m ? !counts[m[1]] : false
}
const items = (over) => {
  if (!over) return [{}]
  if (over.each) return param(over.each).map((v) => ({ [over.as]: v }))
  const out = []
  if (over.ranges) {
    const n = counts[over.ranges.count] || 0
    for (let a = 1, k = 1; a <= n; a += over.ranges.size, k++) {
      const v = { [over.as[0]]: a, [over.as[1]]: Math.min(n, a + over.ranges.size - 1) }
      if (over.index) v[over.index] = k
      out.push(v)
    }
  } else if (over.parts && parts[over.parts]) {
    for (let k = parts[over.parts][0]; k <= parts[over.parts][1]; k++) out.push({ [over.as]: k })
  }
  return out
}

const record = { stages: [] }
for (const name of A.stages || SPEC.order) {
  const s = SPEC.stages.find((x) => x.name === name)
  if (!s) { log('unknown stage ' + name + '; skipped'); continue }
  phase(s.title)
  const st = { stage: name }
  if (s.run) {
    st.run = await runCommands(s.title, s.run, s.count)
    counts[name] = st.run ? st.run.count : 0
    const m = s.parts && st.run && st.run.lines.match(new RegExp(s.parts))
    if (m) parts[name] = [Number(m[1]), Number(m[2])]
    else delete parts[name]
  }
  const stop = s['stop-if']
  if (stop && stop.when !== 'then failed' && holds(stop.when, name, st)) { log(stop.log); record.stages.push(st); break }
  const skip = s['skip-if']
  if (skip && holds(skip.when, name, st)) { st.result = skip.record; record.stages.push(st); continue }
  if (s.task) {
    const list = items(s.over)
    const model = modelOf(s.model)
    const go = (v) => agent(fill(s.task, v), {
      label: label(s, v),
      phase: s.title,
      schema: schemaOf(s.result),
      agentType: s.role || 'general-purpose',
      ...(model ? { model } : {}),
    })
    const res = []
    if (s.mode === 'sequential') { for (const v of list) res.push(await go(v)) }
    else res.push(...(await pipeline(list, (v) => go(v))))
    const done = res.filter(Boolean)
    if (s.missing && done.length < list.length) log(fill(s.missing, { m: list.length - done.length }))
    st.agents = done
  }
  if (s.then) st.then = await runCommands(s.title, s.then.run, s.then.count)
  record.stages.push(st)
  if (stop && stop.when === 'then failed' && holds(stop.when, name, st)) { log(stop.log); break }
}
return record
`;
