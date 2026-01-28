const AuthService = require('../services/auth.service');
const ApiResponse = require('../utils/apiResponse');

class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  static async register(req, res, next) {
    try {
      const { email, password, name, role } = req.body;
      const result = await AuthService.register({ email, password, name, role });
      return ApiResponse.created(res, result, 'User registered successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      return ApiResponse.success(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  static async me(req, res, next) {
    try {
      const user = await AuthService.getUserById(req.user.id);
      return ApiResponse.success(res, user, 'User profile retrieved');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
