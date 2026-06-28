const { Developer, ApiResponse, AppError } = require("@urbackend/common");

module.exports.getCLIProfile = async (req, res, next) => {
  try {
     const developer = await Developer.findById(req.user._id)
      .select("email plan githubUsername avatarUrl");

    if (!developer) {
      return next(new AppError(404, "Developer not found"));
    }

    return new ApiResponse({
      developer: {
        id: developer._id,
        email: developer.email,
        plan: developer.plan,
        githubUsername: developer.githubUsername,
        avatarUrl: developer.avatarUrl,
      },
      auth: {
        scopes: req.cliScopes,
        tokenType: req.cliTokenType,
      },
    }).send(res);
  } catch (err) {
    next(err);
  }
};