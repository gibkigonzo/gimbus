import { blob } from 'hub:blob'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { pathname } = await getValidatedRouterParams(event, z.object({
    pathname: z.string()
  }).parse)

  return blob.serve(event, pathname)
})
