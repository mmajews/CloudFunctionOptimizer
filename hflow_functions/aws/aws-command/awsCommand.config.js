const DEFAULT_URL = process.env.DEFAULT_URL ? process.env.DEFAULT_URL : "https://tej6fdgafk.execute-api.eu-central-1.amazonaws.com/dev/aws-executor-1536";
const DEFAULT_RESOURCE = process.env.DEFAULT_RESOURCE ? process.env.DEFAULT_RESOURCE : "1536";

const AWS_BUCKET = "asia-mgr";
const AWS_PATH = "data/0.25";

exports.default_url = DEFAULT_URL;
exports.default_resource = DEFAULT_RESOURCE;

exports.resources = {
    "128": "https://tej6fdgafk.execute-api.eu-central-1.amazonaws.com/dev/aws-executor-128",
    "256": "https://tej6fdgafk.execute-api.eu-central-1.amazonaws.com/dev/aws-executor-256",
    "512": "https://tej6fdgafk.execute-api.eu-central-1.amazonaws.com/dev/aws-executor-512",
    "1024": "https://tej6fdgafk.execute-api.eu-central-1.amazonaws.com/dev/aws-executor-1024",
    "1536": "https://tej6fdgafk.execute-api.eu-central-1.amazonaws.com/dev/aws-executor-1536"
};

// Google cloud storage
exports.options = {
     "storage": "aws",
     "bucket": AWS_BUCKET,
     "prefix": AWS_PATH,
 };

