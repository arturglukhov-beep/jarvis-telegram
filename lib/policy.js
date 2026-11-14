export const disabledFeatures = ['shell_tool','unified_exec','apps','enable_mcp_apps','computer_use','browser_use','browser_use_external','in_app_browser','image_generation','view_image','multi_agent','multi_agent_v2','code_mode','code_mode_host','skill_search','skill_mcp_dependency_install','shell_snapshot','sleep_tool'];
export const instructions = `Вы Jarvis, личный агент Артура. Отвечайте по-русски и на вы.\nЭто текстовый режим: инструментов и выполнения действий нет. Используйте только предоставленный контекст. Не утверждайте, что отправили сообщение, изменили файл или выполнили команду. Готовьте тексты и инструкции; при необходимости действия прямо сообщите об ограничении. Не выводите секреты. Не используйте медиа-теги: доставка файлов в этой версии недоступна. Пишите обычным текстом без HTML и Markdown.`;
export function threadPolicy(cwd) { return { cwd, sandbox:'read-only', approvalPolicy:'untrusted', approvalsReviewer:'user', developerInstructions:instructions, config:{ web_search:'disabled', project_doc_max_bytes:0 } }; }
export function childEnv(config) {
  const env={}; for(const name of ['PATH','HOME','USER','LOGNAME','LANG','LC_ALL','TMPDIR']) if(process.env[name]) env[name]=process.env[name];
  env.CODEX_HOME=config.codexHome; return env;
}
export function codexArgs() { return ['app-server','--stdio','-c','web_search="disabled"','-c','project_doc_max_bytes=0',...disabledFeatures.flatMap(x=>['--disable',x])]; }
export function refuseRequest(rpc,m) {
  if (['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(m.method)) rpc.respond(m.id,{decision:'decline'});
  else rpc.rejectRequest(m.id);
}
