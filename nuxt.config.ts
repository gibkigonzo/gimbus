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
    // edge/serverless target. Placeholder cadence — adjust once the
    // WORKFLOW_PROMPT in server/tasks/agent/scheduled-run.ts is real.
    scheduledTasks: {
      '0 8 * * *': ['agent:scheduled-run']
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
