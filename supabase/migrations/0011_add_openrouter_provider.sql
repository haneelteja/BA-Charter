-- OpenRouter added as a supported BYOK provider — one key, any model
-- (user_llm_setting.model is a free-text model id, e.g. "openai/gpt-4.1-mini").
alter table user_llm_setting drop constraint user_llm_setting_provider_check;
alter table user_llm_setting
  add constraint user_llm_setting_provider_check
  check (provider in ('openai', 'anthropic', 'openrouter'));
