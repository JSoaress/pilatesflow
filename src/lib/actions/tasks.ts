'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must } from './safe-action';

export async function setTaskStatus(id: string, status: 'open' | 'in_progress' | 'done' | 'cancelled') {
  return runAction({ schema: z.enum(['open', 'in_progress', 'done', 'cancelled']), input: status }, async (ctx, s) => {
    must(await ctx.supabase.from('tasks').update({ status: s }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app/tarefas');
  });
}
