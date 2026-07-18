// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/mdc',
    '@nuxthub/core',
    'nuxt-charts',
    '@nuxt/image'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  mdc: {
    headings: {
      anchorLinks: false
    },
    highlight: {
      // noApiRoute: true
      shikiEngine: 'javascript'
    }
  },

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    experimental: {
      openAPI: true,
      tasks: true
    },
    // In-process croner scheduler — supported on the dev/node-server preset
    // this project runs on (no wrangler/Cloudflare deploy config present).
    // Would need Cloudflare Cron Triggers instead if ever deployed to an
    // edge/serverless target. Each entry here maps a cron expression to one
    // or more task names — task names come from the ScheduledTaskDefinition
    // registry (server/utils/agent/scheduled-task-definitions.ts), each with
    // its own thin task file under server/tasks/agent/scheduled/. Adding a
    // new independent background task = add a definition + a task file +
    // one line here.
    //
    // '0 8 * * *' means 8am in whatever timezone the Node process itself
    // runs in — nitro passes no `timezone` option to croner, so there is no
    // config-level way to pin it here. TZ must be set on the process (see
    // .env's TZ=Europe/Warsaw, the single source of truth for the value) —
    // scheduled-task-runner.ts warns at run time if TZ isn't set at all.
    scheduledTasks: {
      '0 8 * * *': ['agent:scheduled:workflow-digest']
    }
  },

  hub: {
    db: 'sqlite',
    blob: true
  },

  vite: {
    optimizeDeps: {
      include: ['striptags']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
