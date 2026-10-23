CREATE TABLE `sequences` (
	`name` varchar(48) NOT NULL,
	`value` int NOT NULL DEFAULT 0,
	CONSTRAINT `sequences_name` PRIMARY KEY(`name`)
);
