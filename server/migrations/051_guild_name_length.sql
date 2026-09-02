ALTER TABLE guilds
  ADD CONSTRAINT guilds_name_length_check
  CHECK (char_length(name) BETWEEN 3 AND 10);
