import type { RolesEnum } from "../enums";

export class UserEntity {
  id: string;
  email: string;
  password: string;
  username: string;
  phone: string;
  status: string;
  profileImage: string;
  role: RolesEnum;
  isOnline: boolean;
  emailVerified: boolean;
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
  storeId: string;

  constructor(user: UserEntity) {
    this.id = user.id;
    this.email = user.email;
    this.password = user.password;
    this.username = user.username;
    this.phone = user.phone;
    this.status = user.status;
    this.profileImage = user.profileImage;
    this.role = user.role;
    this.isOnline = user.isOnline;
    this.emailVerified = user.emailVerified;
    this.lastLogin = user.lastLogin;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
    this.storeId = user.storeId;
  }
}
