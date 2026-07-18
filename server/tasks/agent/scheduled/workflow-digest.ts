import { runScheduledTask } from '../../../utils/agent/scheduled-task-runner'
import { resolveScheduledTaskDefinition } from '../../../utils/agent/scheduled-task-definitions'

const definition = resolveScheduledTaskDefinition('workflow-digest')!

export default defineTask({
  meta: {
    name: 'agent:scheduled:workflow-digest',
    description: 'Runs the workflow-digest scheduled task unattended and reports into its dedicated chat.'
  },
  async run() {
    // Awaiting the promise (not reading a resolved snapshot) is correct even
    // if this task fires before tool-runtime.ts's plugin body has finished.
    // Called here, not inside scheduled-task-runner.ts, so vue-tsc's build
    // mode keeps NitroApp's toolRuntimePromise augmentation in scope — see
    // the comment on runScheduledTask() for the full explanation.
    const runtime = await useNitroApp().toolRuntimePromise
    return await runScheduledTask(definition, runtime)
  }
})
